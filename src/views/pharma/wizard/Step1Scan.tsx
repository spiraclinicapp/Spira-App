import { useMemo, useRef, useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { MedicationPicker } from '../MedicationPicker'
import { ScanField } from './ScanField'
import { resolveCode, linkCode, useMedications } from '../../../data/pharma'
import { SearchableSelect } from '../../../components/SearchableSelect'
import type { CountedMed } from '../ReceptionWizard'

interface Props {
  accentSolid: string
  meds: CountedMed[]
  setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>>
  /** Mapa medicamento→código de barras (fuente única, vive en el wizard). */
  codeByMed: Map<string, string>
  /** Reconsulta los códigos tras asociar uno nuevo (para que el med salga del "asociar"). */
  onCodesChanged: () => void
}

/**
 * Paso 1 del wizard de recepción (rama base), lenguaje 2a del handoff: buscador central
 * grande + lista de medicamentos cargados en card con stepper −/+ por fila y footer contador.
 * El flujo no cambia: escanear suma +1 (resolveCode), código desconocido abre el panel de
 * asociación (linkCode), y "Buscar a mano" (link, plegado por defecto) muestra el typeahead.
 * La asociación medicamento↔protocolo NO se hace acá: es consecuencia de confirmar la recepción
 * (el RPC `create_reception` la asocia, 0040) — no un paso previo por cada escaneo.
 * El código de barras de cada fila se resuelve EN EL RENDER (`codeOf`): el escaneado viaja en la
 * fila; el resto sale del mapa `codeByMed`, así no queda un dato viejo si la query cargó después.
 */
export function Step1Scan({ accentSolid, meds, setMeds, codeByMed, onCodesChanged }: Props) {
  const catalog = useMedications(); const all = catalog.data ?? []
  // Para asociar un código DESCONOCIDO solo ofrecemos medicamentos SIN código (1 código ↔ 1 med).
  const uncoded = useMemo(() => all.filter((m) => !codeByMed.has(m.id)), [all, codeByMed])
  // Código a mostrar en una fila: el escaneado (viaja en `m.code`) o el del mapa; si no hay, null.
  const codeOf = (m: CountedMed): string | undefined => m.code ?? codeByMed.get(m.medicationId)
  const [scan, setScan] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null); const [linkId, setLinkId] = useState(''); const [linkErr, setLinkErr] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  // Asignar un código de barras a un medicamento cargado que no tiene (inline en su fila).
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [assignCode, setAssignCode] = useState('')
  const [assignErr, setAssignErr] = useState<string | null>(null)
  const [assignBusy, setAssignBusy] = useState(false)
  const openAssign = (id: string) => { setAssignFor(id); setAssignCode(''); setAssignErr(null) }
  const cancelAssign = () => { setAssignFor(null); setAssignCode(''); setAssignErr(null) }
  const saveAssign = async (medicationId: string) => {
    const code = assignCode.trim(); if (!code) return
    setAssignBusy(true); setAssignErr(null)
    const res = await linkCode(code, medicationId)
    setAssignBusy(false)
    if (res.error) { setAssignErr(res.error); return }
    onCodesChanged() // ahora tiene código → la fila lo muestra y sale del "asociar"
    setAssignFor(null); setAssignCode('')
  }

  // `code` viaja solo en el alta de la fila (para mostrar el EAN); los deltas posteriores no lo pisan.
  const bump = (medicationId: string, name: string, delta = 1, code?: string) => {
    setMeds((prev) => {
      const i = prev.findIndex((m) => m.medicationId === medicationId)
      if (i === -1) return delta > 0 ? [...prev, { medicationId, name, quantity: 1, lots: [], code }] : prev
      const next = [...prev]; const q = Math.max(0, next[i].quantity + delta)
      if (q === 0) return next.filter((_, j) => j !== i)
      next[i] = { ...next[i], quantity: q, code: next[i].code ?? code }; return next
    })
  }
  const remove = (medicationId: string) => setMeds((prev) => prev.filter((m) => m.medicationId !== medicationId))
  const handleScan = async () => {
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const med = await resolveCode(code)
    if (!med) { setUnknown(code); setLinkId(''); setLinkErr(null); return }
    bump(med.id, med.name, +1, code); setMsg(`+1 ${med.name}`)
    scanRef.current?.focus()
  }
  const confirmLink = async () => {
    if (!unknown || !linkId) return
    const res = await linkCode(unknown, linkId); if (res.error) { setLinkErr(res.error); return }
    const m = all.find((x) => x.id === linkId); if (m) bump(m.id, m.name, +1, unknown)
    onCodesChanged() // el med ya quedó con código → sale del desplegable de asociar
    setUnknown(null); setLinkId(''); setMsg('Código guardado y +1')
    scanRef.current?.focus()
  }

  const totalItems = meds.reduce((s, m) => s + m.quantity, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <ScanField
        label="Escáner (código de barras)"
        placeholder="Escaneá o tipeá el código y Enter"
        value={scan}
        onChange={setScan}
        onSubmit={() => void handleScan()}
        accentSolid={accentSolid}
        inputRef={scanRef}
      />
      {/* Ayuda + atajo "a mano" (handoff 1d), pegado al escáner: renglón centrado que muestra el
          feedback de escaneo cuando lo hay (si no, la ayuda), divisor, y el atajo. Al pulsar
          "Buscar a mano", el renglón del atajo SE REEMPLAZA por el buscador (× para volver). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p aria-live="polite" style={{ margin: 0, fontSize: 13, color: 'var(--spira-muted)', textAlign: 'center' }}>
          {msg ?? 'Cada beep suma una unidad. Ajustá la cantidad con − / + si hace falta.'}
        </p>
        <div style={{ borderTop: '1px solid var(--spira-line)' }} />
        {manualOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MedicationPicker accent={accentSolid} autoFocus onPick={(id) => { const m = all.find((x) => x.id === id); if (m) bump(id, m.name) }} />
            </div>
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              aria-label="Cerrar búsqueda a mano"
              style={{ width: 40, height: 40, flex: '0 0 auto', border: '1px solid var(--spira-line-2)', borderRadius: 10, background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <Icon name="x" size={16} color="var(--spira-muted)" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, color: 'var(--spira-muted)' }}>
            <Icon name="search" size={15} color="var(--spira-muted)" />
            ¿Sin lector?
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              aria-expanded={manualOpen}
              style={{ border: 'none', background: 'transparent', padding: 0, color: accentSolid, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--spira-font-text)' }}
            >
              Buscar a mano
            </button>
          </div>
        )}
      </div>

      {unknown && (
        <div style={linkPanel}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Código <span className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{unknown}</span> sin asociar. ¿A qué medicamento corresponde?</span>
          {/* Solo medicamentos SIN código: cada código es único por medicamento (1 ↔ 1). */}
          <SearchableSelect
            value={linkId}
            onChange={setLinkId}
            options={uncoded.map((m) => ({ value: m.id, label: `${m.name}${m.drug ? ` · ${m.drug.name}` : ''}` }))}
            placeholder="Elegí el medicamento"
            searchPlaceholder="Buscar medicamento…"
            entity="medicamento"
            disabled={uncoded.length === 0}
          />
          {uncoded.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
              Todos los medicamentos del catálogo ya tienen un código. Si es un producto nuevo, crealo primero en Medicamentos.
            </div>
          )}
          {linkErr && <div style={errorBox} aria-live="assertive">{linkErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void confirmLink()} disabled={!linkId} style={{ ...btnPrimary(accentSolid), height: 38, opacity: linkId ? 1 : 0.6 }}>Asociar y agregar</button>
            <button type="button" onClick={() => setUnknown(null)} style={{ ...btnOutline, height: 38 }}>No asociar</button>
          </div>
        </div>
      )}

      {meds.length === 0 ? (
        /* `package` no existe en IconName; se usa `box` que es semánticamente equivalente
           (caja/paquete de medicamentos). Adaptación necesaria por strict TS. */
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer medicamento" description="Cada beep suma uno. Ajustá la cantidad con − / + si hace falta." minHeight={200} />
      ) : (
        <div style={listCard}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {meds.map((m, i) => (
              <li key={m.medicationId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
                <span style={iconSq}>
                  <Icon name="pill" size={19} color="var(--spira-pharma-solid)" stroke={1.9} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  {codeOf(m) ? (
                    <div className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 1 }}>{codeOf(m)}</div>
                  ) : assignFor === m.medicationId ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <input
                          className="spira-mono"
                          value={assignCode}
                          onChange={(e) => setAssignCode(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); void saveAssign(m.medicationId) }
                            if (e.key === 'Escape') cancelAssign()
                          }}
                          autoFocus
                          placeholder="Escaneá o tipeá el código"
                          aria-label={`Código de barras para ${m.name}`}
                          style={{ ...fieldInput, height: 32, maxWidth: 220, fontSize: 12.5 }}
                        />
                        <button type="button" onClick={() => void saveAssign(m.medicationId)} disabled={!assignCode.trim() || assignBusy} style={{ ...btnPrimary(accentSolid), height: 32, fontSize: 12.5, padding: '0 12px', opacity: (!assignCode.trim() || assignBusy) ? 0.6 : 1 }}>Guardar</button>
                        <button type="button" onClick={cancelAssign} style={{ ...btnOutline, height: 32, fontSize: 12.5, padding: '0 12px' }}>Cancelar</button>
                      </div>
                      {assignErr && <div style={{ fontSize: 12, color: 'var(--spira-acc-deep-danger)', marginTop: 4 }} aria-live="assertive">{assignErr}</div>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--spira-acc-deep-warn)', marginTop: 1 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="alertCircle" size={12} color="var(--spira-warn)" /> Sin código de barras
                      </span>
                      <button type="button" onClick={() => openAssign(m.medicationId)} style={{ border: 'none', background: 'transparent', padding: 0, color: accentSolid, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--spira-font-text)' }}>· Asignar código</button>
                    </div>
                  )}
                </div>
                {/* Stepper −/+ agrupado (handoff 2a); 44px de alto = hit target de la nota del handoff */}
                <div style={qtyGroup}>
                  <button type="button" aria-label="Restar uno" onClick={() => bump(m.medicationId, m.name, -1)} style={qtyBtn}>
                    <Icon name="minus" size={14} color="var(--spira-muted)" stroke={2.2} />
                  </button>
                  <span className="spira-mono" style={{ minWidth: 30, textAlign: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{m.quantity}</span>
                  <button type="button" aria-label="Sumar uno" onClick={() => bump(m.medicationId, m.name, +1)} style={qtyBtn}>
                    <Icon name="plus" size={14} color="var(--spira-pharma-solid)" stroke={2.2} />
                  </button>
                </div>
                <button type="button" aria-label={`Quitar ${m.name}`} onClick={() => remove(m.medicationId)} style={delBtn}>
                  <Icon name="x" size={16} color="var(--spira-faint)" />
                </button>
              </li>
            ))}
          </ul>
          {/* Footer contador (handoff 2a): números en display */}
          <div style={listFooter}>
            <Icon name="box" size={16} color="var(--spira-faint)" />
            <span>
              <strong style={contadorNum}>{meds.length}</strong> {meds.length === 1 ? 'medicamento' : 'medicamentos'}
              {' · '}
              <strong style={contadorNum}>{totalItems}</strong> {totalItems === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const linkPanel = { border: '1px solid rgba(176,130,63,0.38)', background: 'rgba(176,130,63,0.10)', borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 } as const
const errorBox = { fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' } as const
const listCard = { background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--spira-shadow-sm)' } as const
const iconSq = { width: 38, height: 38, flex: '0 0 auto', borderRadius: 10, background: 'rgba(15, 95, 87,.13)', display: 'grid', placeItems: 'center' } as const
const qtyGroup = { display: 'inline-flex', alignItems: 'center', border: '1px solid var(--spira-line-2)', borderRadius: 9, overflow: 'hidden', background: 'var(--spira-white)' } as const
const qtyBtn = { width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' } as const
const delBtn = { width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 8 } as const
const listFooter = { borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--spira-muted)' } as const
const contadorNum = { color: 'var(--spira-ink)', fontWeight: 700, fontFamily: 'var(--spira-font-display)', fontSize: 15, fontVariantNumeric: 'tabular-nums' } as const
