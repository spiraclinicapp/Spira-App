import { useMemo } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props {
  units: IpUnitDraft[]
  receptionDate: string
  notes: string
  setReceptionDate: (d: string) => void
  setNotes: (n: string) => void
}

/**
 * Paso 3 del wizard de IP: fecha, notas y resumen agregado. Presentacional:
 * el CTA "Crear recepción" y el submit (con el guard de kits vacíos) viven en el wizard.
 */
export function Step3SummaryIp({ units, receptionDate, notes, setReceptionDate, setNotes }: Props) {
  // Métricas agregadas del lote a recibir. `porVencer` abarca las ya vencidas más las que
  // vencen en los próximos 30 días, alineado con los flags `vencida`/`por_vencer` de v_ip_units.
  const agg = useMemo(() => {
    const conDroga = units.filter((u) => u.drugId).length
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const porVencer = units.filter((u) => u.expiryDate && u.expiryDate < in30).length
    return { total: units.length, conDroga, cegadas: units.length - conDroga, porVencer }
  }, [units])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780, width: '100%', margin: '0 auto' }}>
      {/* Fecha y notas */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Fecha de recepción</div>
          <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} style={fieldInput} />
        </label>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Notas (opcional)</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
        </label>
      </div>

      {/* Resumen agregado: total en display grande, desgloses en muted */}
      <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24 }}>{agg.total}</span>
          <span style={{ fontWeight: 600 }}>{agg.total === 1 ? 'unidad' : 'unidades'}</span>
        </div>
        <div style={{ color: 'var(--spira-muted)', fontSize: 13.5, marginTop: 6 }}>
          {agg.conDroga} con droga · {agg.cegadas} cegadas
          {agg.porVencer ? ` · ${agg.porVencer} vencidas/por vencer` : ''}
        </div>
      </div>

      {/* Nota de trazabilidad (handoff 1d) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <Icon name="shield" size={15} color="var(--spira-muted)" /> Queda registrada con trazabilidad completa, unidad por unidad.
      </div>
    </div>
  )
}
