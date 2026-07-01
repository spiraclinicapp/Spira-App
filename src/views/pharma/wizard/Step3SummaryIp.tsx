import { useMemo, useState } from 'react'
import { fieldInput, FormField } from '../../../components/FormField'
import { btnPrimary } from '../../../components/buttons'
import { createIpReception } from '../../../data/pharma'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props {
  protocolId: string
  units: IpUnitDraft[]
  receptionDate: string
  notes: string
  setReceptionDate: (d: string) => void
  setNotes: (n: string) => void
  accentSolid: string
  onCreated: (id: string) => void
}

/**
 * Paso 3 del wizard de IP: fecha, notas y resumen agregado antes de confirmar.
 * Calcula totales (con droga / cegadas / vencidas) y llama a `createIpReception`
 * de forma atómica. Guard: no avanza si algún kit quedó vacío (fallback manual incompleto).
 */
export function Step3SummaryIp({
  protocolId,
  units,
  receptionDate,
  notes,
  setReceptionDate,
  setNotes,
  accentSolid,
  onCreated,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Métricas agregadas del lote a recibir. `porVencer` abarca las ya vencidas más las que
  // vencen en los próximos 30 días, alineado con los flags `vencida`/`por_vencer` de v_ip_units.
  const agg = useMemo(() => {
    const conDroga = units.filter((u) => u.drugId).length
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const porVencer = units.filter((u) => u.expiryDate && u.expiryDate < in30).length
    return { total: units.length, conDroga, cegadas: units.length - conDroga, porVencer }
  }, [units])

  const create = async () => {
    if (!protocolId || !receptionDate || units.length === 0) return

    // Guard: toda unidad necesita N° de kit (el fallback manual pudo quedar vacío).
    const sinKit = units.filter((u) => !u.kitNumber.trim()).length
    if (sinKit > 0) {
      setError(`Hay ${sinKit} unidad(es) sin N° de kit. Completá en Revisión.`)
      return
    }

    setBusy(true)
    setError(null)

    const res = await createIpReception({
      protocolId,
      receptionDate,
      notes: notes.trim() || null,
      units: units.map((u) => ({
        kit_number: u.kitNumber.trim(),
        raw_code: u.rawCode || null,
        gtin: u.gtin || null,
        lot_number: u.lotNumber || null,
        expiry_date: u.expiryDate || null,
        drug_id: u.drugId || null,
      })),
    })

    setBusy(false)

    if (res.error) {
      setError(res.error)
      return
    }
    if (res.id) onCreated(res.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      {/* Fecha y notas */}
      <FormField label="Fecha de recepción">
        <input
          type="date"
          value={receptionDate}
          onChange={(e) => setReceptionDate(e.target.value)}
          style={fieldInput}
        />
      </FormField>
      <FormField label="Notas (opcional)">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opcional"
          style={fieldInput}
        />
      </FormField>

      {/* Resumen agregado: total, con droga/cegadas, vencidas/por vencer */}
      <div
        style={{
          border: '1px solid var(--spira-line)',
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 13.5,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{agg.total} unidades</div>
        <div style={{ color: 'var(--spira-muted)' }}>
          {agg.conDroga} con droga · {agg.cegadas} cegadas
          {agg.porVencer ? ` · ${agg.porVencer} vencidas/por vencer` : ''}
        </div>
      </div>

      {/* Mensaje de error (validación local o respuesta del RPC) */}
      {error && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--spira-danger)',
            background: 'rgba(166,72,59,0.10)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {/* Botón de confirmación: muestra estado y queda disabled mientras crea */}
      <button
        type="button"
        onClick={() => void create()}
        disabled={busy || units.length === 0}
        style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1 }}
      >
        {busy ? `Creando ${agg.total} unidades…` : 'Crear recepción'}
      </button>
    </div>
  )
}
