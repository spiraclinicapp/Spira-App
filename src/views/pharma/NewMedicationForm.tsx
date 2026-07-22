import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import {
  useDrugs, createDrug, deleteDrug, createMedication, updateMedication, useDoses, useClases, useMedications,
  useLaboratorios, createLaboratorio, deleteLaboratorio, resolveLabByCode, linkLabPrefix, linkCode, updateCode,
} from '../../data/pharma'
import type { MedicationRow } from '../../data/pharma'

/** Presentaciones / métodos base (semilla del desplegable "Método"; se puede sumar con "Agregar nuevo"). */
const PRESENTACIONES = [
  'Comprimido oral', 'Aerosol (IDM)', 'Polvo seco', 'Cápsulas para inhalación',
  'Spray nasal', 'Inyectable IM mensual',
]

/** Nombre normalizado para comparar duplicados (espeja el índice único 0042). */
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Separa el nombre comercial de la dosis embebida (el alta compone `nombre = comercial + dosis`). */
function stripDosis(name: string, dosis: string | null): string {
  if (dosis && name.endsWith(` ${dosis}`)) return name.slice(0, -(dosis.length + 1))
  return name
}

/** Valor de `unit` cuando el usuario no elige Método (la base lo pide NOT NULL). */
const SIN_METODO = 'Sin especificar'
const uniqStrings = (arr: (string | null | undefined)[]) => [...new Set(arr.filter((x): x is string => !!x))].sort()

/** Botón secundario en tono peligro (contorno danger, fondo blanco) para la zona de eliminación. */
const btnOutlineDanger: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 15px', borderRadius: 10,
  border: '1px solid rgba(166,72,59,.42)', background: 'var(--spira-white)', color: 'var(--spira-danger)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14, cursor: 'pointer', flex: '0 0 auto',
}

interface Props {
  accentSolid: string
  onClose: () => void
  onCreated: () => void
  /** Si viene, el form abre en modo EDICIÓN de ese medicamento (opcional; por default es alta). */
  editing?: MedicationRow | null
  /** Código de barras actual del medicamento que se edita (vive en `medication_codes`, aparte de la
   *  fila). Precarga el campo Código en modo edición; en alta va vacío. */
  currentCode?: string | null
  /** Si viene (y hay `editing`), muestra la zona de eliminación al pie. La confirmación la maneja
   *  el que abre el form (MedicamentosView), gateado por permiso. Ausente = sin zona de baja. */
  onDelete?: () => void
}

/**
 * "Registrar medicación": alta / edición de un medicamento del catálogo GLOBAL (rediseño 7a). Acento
 * petróleo. Todos los campos son desplegable-con-buscador excepto Nombre comercial y Código de barras
 * (texto). Solo Nombre comercial es obligatorio. Anti-duplicado por nombre+método (índice único 0042);
 * si ya existe, ofrece editar el existente. El código y el laboratorio se editan aparte, así que en
 * modo edición se ocultan (updateMedication no los toca).
 */
export function NewMedicationForm({ onClose, onCreated, editing: initialEditing, currentCode: initialCurrentCode, onDelete }: Props) {
  const drugs = useDrugs()
  const doses = useDoses()
  const clases = useClases()
  const labs = useLaboratorios()
  const catalog = useMedications()

  const [editing, setEditing] = useState<MedicationRow | null>(initialEditing ?? null)
  const [comercial, setComercial] = useState(initialEditing ? stripDosis(initialEditing.name, initialEditing.dosis) : '')
  const [dosisVal, setDosisVal] = useState(initialEditing?.dosis ?? '')
  const [metodoVal, setMetodoVal] = useState(initialEditing && initialEditing.unit !== SIN_METODO ? initialEditing.unit : '')
  const [drugId, setDrugId] = useState(initialEditing?.drug?.id ?? '')
  const [claseVal, setClaseVal] = useState(initialEditing?.clase ?? '')
  const [gtin, setGtin] = useState(initialCurrentCode ?? '')
  const [labId, setLabId] = useState(initialEditing?.laboratorio_id ?? '')
  // El operador eligió el laboratorio a mano → no lo pisa el autodetect. En edición arranca en true:
  // el lab ya viene precargado del medicamento, el autodetect por prefijo no debe clobbearlo.
  const labManualRef = useRef(!!initialEditing)
  const [error, setError] = useState<string | null>(null)
  const [dup, setDup] = useState<MedicationRow | null>(null)
  const [busy, setBusy] = useState(false)

  const dosisOptions: SelectOption[] = uniqStrings((doses.data ?? []).map((d) => d.dosis)).map((s) => ({ value: s, label: s }))
  const claseOptions: SelectOption[] = uniqStrings((clases.data ?? []).map((c) => c.clase)).map((s) => ({ value: s, label: s }))
  const metodoOptions: SelectOption[] = uniqStrings([...PRESENTACIONES, ...(catalog.data ?? []).map((m) => m.unit)])
    .filter((s) => s !== SIN_METODO).map((s) => ({ value: s, label: s }))
  const drugOptions: SelectOption[] = (drugs.data ?? []).map((d) => ({ value: d.id, label: d.name }))
  const labOptions: SelectOption[] = (labs.data ?? []).map((l) => ({ value: l.id, label: l.name }))

  // Autodetección del laboratorio por el prefijo del GTIN (mientras no se haya elegido a mano).
  useEffect(() => {
    if (gtin.replace(/\D/g, '').length < 8) return
    let cancel = false
    void resolveLabByCode(gtin).then((lab) => {
      if (cancel || !lab || labManualRef.current) return
      setLabId(lab.id)
    })
    return () => { cancel = true }
  }, [gtin])

  // "Agregar nuevo" de monodroga / laboratorio: crea el registro (FK) y devuelve la opción, o {error}
  // para que el panel del dropdown muestre el motivo. El refetch actualiza la lista.
  const addDrug = async (t: string): Promise<SelectOption | { error: string }> => {
    const r = await createDrug(t.trim())
    if (r.error || !r.id) return { error: r.error ?? 'No pudimos crear la monodroga.' }
    drugs.refetch()
    return { value: r.id, label: t.trim() }
  }
  const addLab = async (t: string): Promise<SelectOption | { error: string }> => {
    const r = await createLaboratorio(t.trim())
    if (r.error || !r.id) return { error: r.error ?? 'No pudimos crear el laboratorio.' }
    labs.refetch()
    return { value: r.id, label: t.trim() }
  }
  // Dosis / método / clase son texto libre sobre el medicamento: "Agregar nuevo" fija el valor tipeado.
  const addText = (t: string): SelectOption => ({ value: t.trim(), label: t.trim() })

  // Eliminar del catálogo (con confirmación en el dropdown). Al borrar, refresca y limpia la selección.
  const delDrug = async (o: SelectOption): Promise<{ error: string | null }> => {
    const r = await deleteDrug(o.value)
    if (r.error) return { error: r.error }
    drugs.refetch()
    if (drugId === o.value) setDrugId('')
    return { error: null }
  }
  const delLab = async (o: SelectOption): Promise<{ error: string | null }> => {
    const r = await deleteLaboratorio(o.value)
    if (r.error) return { error: r.error }
    labs.refetch()
    if (labId === o.value) setLabId('')
    return { error: null }
  }

  const applyEdit = (med: MedicationRow) => {
    setEditing(med); setDup(null); setError(null)
    setComercial(stripDosis(med.name, med.dosis))
    setDosisVal(med.dosis ?? '')
    setMetodoVal(med.unit !== SIN_METODO ? med.unit : '')
    setDrugId(med.drug?.id ?? '')
    setClaseVal(med.clase ?? '')
    setLabId(med.laboratorio_id ?? ''); labManualRef.current = true // el lab del existente manda; sin autodetect
  }
  const clearDup = () => { if (dup) setDup(null) }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const comercialClean = comercial.trim()
    if (!comercialClean) { setError('Escribí el nombre comercial.'); return }

    const resolvedDosis = dosisVal.trim()
    const fullName = resolvedDosis ? `${comercialClean} ${resolvedDosis}` : comercialClean
    const unitVal = metodoVal.trim() || SIN_METODO

    // Guard anti-duplicado (best-effort; el índice único 0042 es el candado duro).
    const yaExiste = (catalog.data ?? []).find(
      (m) => m.id !== editing?.id && normName(m.name) === normName(fullName) && m.unit === unitVal,
    )
    if (yaExiste) {
      if (editing) { setError('Ya existe otro medicamento con ese nombre y método.'); return }
      setDup(yaExiste); return
    }

    setBusy(true)
    setError(null)

    if (editing) {
      // 1. Código de barras (tabla aparte, único global): asignar/cambiar si vino un valor NUEVO.
      //    Vaciar el campo NO borra el código existente (para quitarlo, el flujo dedicado). Va primero:
      //    el 23505 (código ya usado por otro medicamento) debe frenar ANTES de tocar la fila.
      const nuevoCode = gtin.trim()
      const actualCode = (initialCurrentCode ?? '').trim()
      if (nuevoCode && nuevoCode !== actualCode) {
        const rc = actualCode ? await updateCode(editing.id, nuevoCode) : await linkCode(nuevoCode, editing.id)
        if (rc.error) { setBusy(false); setError(rc.error); return }
      }
      // 2. Campos de la fila (incl. laboratorio).
      const res = await updateMedication({
        id: editing.id, drug_id: drugId || null, name: fullName, unit: unitVal,
        low_stock_threshold: editing.low_stock_threshold, dosis: resolvedDosis || null, clase: claseVal.trim() || null,
        laboratorio_id: labId || null,
      })
      if (res.error) { setBusy(false); setError(res.error); return }
      // 3. Aprender el prefijo del código → laboratorio (best-effort, como en el alta).
      if (nuevoCode && labId) { try { await linkLabPrefix(nuevoCode, labId) } catch { /* no bloquea el guardado */ } }
      setBusy(false)
      onCreated()
      return
    }

    const res = await createMedication({
      drug_id: drugId || null,
      name: fullName,
      unit: unitVal,
      low_stock_threshold: 5,
      gtin: gtin.trim() || null,
      laboratorio_id: labId || null,
      dosis: resolvedDosis || null,
      clase: claseVal.trim() || null,
    })
    if (res.error || !res.id) {
      setBusy(false)
      if (res.code === '23505') {
        const found = (catalog.data ?? []).find((m) => normName(m.name) === normName(fullName) && m.unit === unitVal)
        if (found) { setDup(found); return }
        catalog.refetch() // el dup no está en el cache (concurrente / sin cargar) → recargar para la próxima
      }
      setError(res.error ?? 'No pudimos crear el medicamento.')
      return
    }
    // Aprender el prefijo del GTIN → laboratorio: best-effort, NO bloquea el cierre (el med ya se creó).
    if (gtin.trim() && labId) {
      try { await linkLabPrefix(gtin.trim(), labId) } catch { /* no-op: el alta ya fue exitosa */ }
    }
    setBusy(false)
    onCreated()
  }

  const canSubmit = !!comercial.trim() && !busy

  return (
    <Modal
      title={editing ? 'Editar medicación' : 'Registrar medicación'}
      icon="pill"
      accent="var(--spira-primary)"
      accentSoft="rgba(15,95,87,.12)"
      maxWidth={520}
      onClose={onClose}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div>
          <FieldLabel required>Nombre comercial</FieldLabel>
          <input value={comercial} onChange={(e) => { setComercial(e.target.value); clearDup() }} autoFocus placeholder="Ej. Alvetide 184/22 mcg" style={fieldInput} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 168px', gap: 12 }}>
          <div>
            <FieldLabel>Dosis</FieldLabel>
            <SearchableSelect value={dosisVal} onChange={(v) => { setDosisVal(v); clearDup() }} options={dosisOptions} placeholder="Elegí o buscá…" searchPlaceholder="Buscar dosis…" entity="dosis" onCreate={addText} />
          </div>
          <div>
            <FieldLabel>Método</FieldLabel>
            <SearchableSelect value={metodoVal} onChange={(v) => { setMetodoVal(v); clearDup() }} options={metodoOptions} placeholder="—" searchPlaceholder="Buscar método…" entity="método" onCreate={addText} />
          </div>
        </div>

        <div>
          <FieldLabel>Monodroga</FieldLabel>
          <SearchableSelect value={drugId} onChange={setDrugId} options={drugOptions} placeholder="Elegí o buscá la monodroga…" searchPlaceholder="Buscar monodroga…" entity="monodroga" onCreate={addDrug} onDelete={delDrug} />
        </div>

        <div>
          <FieldLabel>Código de barras</FieldLabel>
          <div style={{ position: 'relative' }}>
            <input value={gtin} onChange={(e) => setGtin(e.target.value)} className="spira-mono" placeholder="Escaneá o ingresá el EAN13" style={{ ...fieldInput, paddingRight: 42 }} />
            <span style={{ position: 'absolute', right: 13, top: 0, height: 44, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <Icon name="barcode" size={18} color="var(--spira-pharma-solid)" />
            </span>
          </div>
        </div>

        <div>
          <FieldLabel>Laboratorio</FieldLabel>
          <SearchableSelect value={labId} onChange={(v) => { labManualRef.current = true; setLabId(v) }} options={labOptions} placeholder="Elegí o buscá el laboratorio…" searchPlaceholder="Buscar laboratorio…" entity="laboratorio" onCreate={addLab} onDelete={delLab} />
        </div>

        <div>
          <FieldLabel>Clase / Indicación</FieldLabel>
          <SearchableSelect value={claseVal} onChange={setClaseVal} options={claseOptions} placeholder="Elegí o buscá…" searchPlaceholder="Buscar clase…" entity="clase" onCreate={addText} />
        </div>

        {dup && (
          <div style={{ background: 'rgba(176,130,63,0.10)', border: '1px solid rgba(176,130,63,0.38)', borderRadius: 10, padding: '11px 13px' }} aria-live="assertive">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>Este artículo ya se encuentra creado</div>
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
              {dup.name}{dup.drug ? ` · ${dup.drug.name}` : ''} · {dup.unit}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => applyEdit(dup)} style={{ ...btnPrimary('var(--spira-primary)'), height: 36 }}>Editar el existente</button>
              <button type="button" onClick={() => setDup(null)} style={{ ...btnOutline, height: 36 }}>Cambiar los datos</button>
            </div>
          </div>
        )}
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        {editing && onDelete && (
          <div style={{ borderTop: '1px solid var(--spira-line)', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)' }}>Eliminar del catálogo</div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>Quita este medicamento de forma permanente.</div>
            </div>
            <button type="button" onClick={onDelete} style={btnOutlineDanger}>
              <Icon name="trash" size={15} color="var(--spira-danger)" /> Eliminar
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 11, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...btnOutline, height: 44 }}>Cancelar</button>
          <button type="submit" disabled={!canSubmit} style={{ ...btnPrimary('var(--spira-primary)'), height: 44, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'default' }}>
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar al catálogo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Label de campo estilo eyebrow (uppercase, tracked) del handoff 7a; el * del requerido en danger. */
function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--spira-muted)', marginBottom: 6 }}>
      {children}{required && <span style={{ color: 'var(--spira-danger)' }}> *</span>}
    </div>
  )
}
