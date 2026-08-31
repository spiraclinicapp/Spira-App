import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import type { SelectOption } from '../../../components/SearchableSelect'
import { fieldLabelStyle } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { ReportForm, boxInput, Helper } from './ReportForm'
import {
  CATEGORIAS, DURACION_PRESETS, etaLabel, knownReports, platformMeta,
} from './reportes'
import { setProcedureReports, updateProcedureCatalog } from '../../../data/protocolProcedures'
import type { EstudioProcedimiento, ReportDefinitionRow, ReportInput } from '../../../data/protocolProcedures'

/** Clave estable para un reporte del borrador: el id de la base, o uno temporal para los nuevos. */
type Draft = ReportInput & { key: string }

function toDraft(r: ReportDefinitionRow): Draft {
  return {
    key: r.id, id: r.id, name: r.name, platform: r.platform,
    link: r.link, eta_hours: r.eta_hours, notes: r.notes,
  }
}

/**
 * Modal "Editar procedimiento": los datos del catálogo arriba, sus reportes abajo, UN solo footer.
 *
 * TODO se guarda junto, con "Guardar cambios". Agregar, editar o borrar un reporte toca únicamente
 * el borrador en memoria; recién al confirmar salen las dos operaciones (el catálogo por UPDATE, los
 * reportes por la RPC atómica `set_procedure_reports`). Esto es una desviación DELIBERADA del
 * handoff, que especificaba que los reportes impactaran al toque: con ese diseño, borrar un reporte
 * y apretar "Cancelar" dejaba el reporte borrado igual. Un botón que dice Cancelar tiene que
 * cancelar (decisión de la review, 2026-08-23).
 *
 * Ojo con los permisos, que NO son los mismos arriba y abajo: los campos del catálogo (nombre,
 * iniciales, categoría, duración) viven en `procedures`, que es GLOBAL — renombrar ahí renombra en
 * todos los protocolos — y su RLS pide gerencia o track-leader. Los reportes son de este estudio y
 * piden track-operator. Por eso `canEditCatalog` llega aparte y, sin él, la mitad de arriba se
 * muestra inerte con su motivo en vez de dejar escribir y fallar al guardar.
 */
export function ProcedureEditModal({
  proc, todosLosReportes, accent, accentSolid, canEditCatalog, onClose, onSaved,
}: {
  proc: EstudioProcedimiento
  /** Reportes de TODO el estudio: alimentan el combobox de "ya usados en otros procedimientos". */
  todosLosReportes: ReportDefinitionRow[]
  accent: string
  accentSolid: string
  canEditCatalog: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(proc.name)
  const [code, setCode] = useState(proc.code ?? '')
  const [category, setCategory] = useState(proc.category ?? '')
  const [dur, setDur] = useState<number | null>(proc.min_estimated)
  /* ¿La duración se carga con el desplegable o con el input libre? Arranca en libre si el valor
     guardado no es uno de los presets (si no, el select mostraría un preset que no es el dato). */
  const [durLibre, setDurLibre] = useState(proc.min_estimated != null && !DURACION_PRESETS.includes(proc.min_estimated))

  const [drafts, setDrafts] = useState<Draft[]>(proc.reports.map(toDraft))
  /** Qué reporte se está editando: su `key`, 'nuevo', o null (ninguno). */
  const [editando, setEditando] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const catOptions: SelectOption[] = CATEGORIAS.map((c) => ({ value: c.name, label: c.name, dot: c.color }))
  /* Si la categoría guardada no está en la lista conocida, se suma como opción para no perderla al
     abrir el modal (el campo es texto libre en la base). */
  if (category && !catOptions.some((o) => o.value === category)) {
    catOptions.unshift({ value: category, label: category })
  }

  const known = knownReports(
    todosLosReportes.filter((r) => r.protocol_procedure_id !== proc.id),
  )

  const quitar = (key: string) => {
    setDrafts((cur) => cur.filter((d) => d.key !== key))
    if (editando === key) setEditando(null)
  }

  const guardarReporte = (r: ReportInput, key: string | 'nuevo') => {
    setDrafts((cur) => {
      if (key === 'nuevo') return [...cur, { ...r, key: `tmp-${cur.length}-${r.name}` }]
      return cur.map((d) => (d.key === key ? { ...r, key: d.key } : d))
    })
    setEditando(null)
  }

  const guardar = async () => {
    if (name.trim() === '') {
      setError('El procedimiento necesita un nombre.')
      return
    }
    setBusy(true)
    setError(null)

    // Primero el catálogo (solo si la persona puede y si algo cambió), después los reportes. Si el
    // catálogo falla, se corta acá: guardar los reportes de un procedimiento cuyo nombre no se pudo
    // cambiar deja al usuario sin saber qué se aplicó y qué no.
    const catalogoCambio =
      name.trim() !== proc.name ||
      (code.trim() || null) !== proc.code ||
      (category.trim() || null) !== proc.category ||
      dur !== proc.min_estimated
    if (canEditCatalog && catalogoCambio) {
      const res = await updateProcedureCatalog(proc.procedure_id, {
        name, code: code || null, category: category || null, min_estimated: dur,
      })
      if (res.error) {
        setBusy(false)
        setError(res.error)
        return
      }
    }

    const res = await setProcedureReports(
      proc.id,
      drafts.map((d) => ({ id: d.id, name: d.name, platform: d.platform, link: d.link, eta_hours: d.eta_hours, notes: d.notes })),
    )
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      title="Editar procedimiento"
      onClose={onClose}
      /* 660 y no los 620 del handoff: ese ancho se dibujó para el modal SOLO, y adentro terminó
         viviendo el formulario de reporte con su renglón de cinco chips más el campo de plazo.
         A 620 ese renglón entraba por doce píxeles — cualquier fuente que rinda un poco más ancho
         lo partía en dos. Cuarenta píxeles de más resuelven la fila y le dan aire a todo el resto,
         que es mejor que raspar el padding de cada chip hasta que entre. */
      maxWidth={660}
      icon="pencil"
      accent={accent}
      accentSoft={accent + '1F'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!canEditCatalog && (
          <div style={avisoBox}>
            Podés editar los reportes de este estudio. El nombre, las iniciales, la categoría y la
            duración son del catálogo general —los comparten todos los protocolos— y los edita
            gerencia o un líder de Coordinación.
          </div>
        )}

        {/* Nombre */}
        <label style={campo}>
          <span style={fieldLabelStyle}>Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEditCatalog}
            style={{ ...boxInput, ...(canEditCatalog ? null : inerte) }}
          />
        </label>

        {/* Iniciales + Categoría */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <label style={{ ...campo, flex: '0 0 110px' }}>
            <span style={fieldLabelStyle}>Iniciales</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!canEditCatalog}
              className="spira-mono"
              style={{ ...boxInput, textAlign: 'center', ...(canEditCatalog ? null : inerte) }}
            />
          </label>
          <div style={{ ...campo, flex: 1, minWidth: 0 }}>
            <span style={fieldLabelStyle}>Categoría</span>
            <SearchableSelect
              value={category}
              onChange={setCategory}
              options={catOptions}
              placeholder="Sin categoría"
              searchPlaceholder="Buscar categoría…"
              entity="categoría"
              disabled={!canEditCatalog}
            />
          </div>
        </div>

        {/* Demora estimada */}
        <div style={campo}>
          <span style={fieldLabelStyle}>Demora estimada</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              {/* El desplegable de la app, no el nativo del sistema: en el mismo modal conviven éste
                  y el de Categoría, y uno con la caja de Windows al lado del otro se ve como dos
                  aplicaciones distintas. `searchable="never"` porque son diez opciones de dos
                  palabras — un buscador acá es ruido, no ayuda. */}
              <SearchableSelect
                value={durLibre ? 'otra' : dur == null ? 'sin' : String(dur)}
                onChange={(v) => {
                  if (v === 'otra') { setDurLibre(true); return }
                  setDurLibre(false)
                  setDur(v === 'sin' ? null : Number(v))
                }}
                options={[
                  { value: 'sin', label: 'Sin definir' },
                  ...DURACION_PRESETS.map((m) => ({ value: String(m), label: `${m} min` })),
                  { value: 'otra', label: 'Otra…' },
                ]}
                placeholder="Sin definir"
                searchable="never"
                disabled={!canEditCatalog}
              />
            </span>
            {durLibre && (
              <input
                type="number"
                min={1}
                max={1440}
                value={dur == null ? '' : String(dur)}
                disabled={!canEditCatalog}
                onChange={(e) => setDur(e.target.value.trim() === '' ? null : Number(e.target.value))}
                aria-label="Duración en minutos"
                placeholder="min"
                style={{ ...boxInput, width: 120, flex: '0 0 auto', ...(canEditCatalog ? null : inerte) }}
              />
            )}
          </div>
          <Helper>Cuánto dura el procedimiento en promedio, de principio a fin.</Helper>
        </div>

        {/* —— Reportes —— */}
        <div style={{ borderTop: '1px solid var(--spira-line)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="fileText" size={16} color={accent} />
            <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>Reportes</span>
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>({drafts.length})</span>
          </div>

          {drafts.length === 0 && editando !== 'nuevo' && (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '2px 0' }}>
              Este procedimiento todavía no genera ningún reporte.
            </div>
          )}

          {drafts.map((d) => {
            const meta = platformMeta(d.platform)
            if (editando === d.key) {
              return (
                <div key={d.key} style={editBox}>
                  <ReportForm
                    inicial={d}
                    known={known}
                    accent={accent}
                    accentSolid={accentSolid}
                    onCancel={() => setEditando(null)}
                    onSave={(r) => guardarReporte(r, d.key)}
                  />
                </div>
              )
            }
            return (
              <div key={d.key} style={reporteRow}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13.5, color: 'var(--spira-ink)', fontWeight: 600 }}>{d.name}</span>
                  {d.notes && (
                    <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>{d.notes}</span>
                  )}
                </span>
                {/* Badge de plataforma: el color va en el punto, el texto en tinta. Teñir el texto
                    con el color de marca no llega a AA (ver la nota de CATEGORIAS). */}
                <span style={badge}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flex: '0 0 auto' }} />
                  {meta.label}
                  {d.link && <Icon name="externalLink" size={11} color="var(--spira-muted)" />}
                </span>
                <span className="spira-mono" style={{ fontSize: 11.5, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
                  {etaLabel(d.eta_hours)}
                </span>
                <button type="button" onClick={() => setEditando(d.key)} title={`Editar ${d.name}`} aria-label={`Editar ${d.name}`} style={iconBtn}>
                  <Icon name="pencil" size={13} color="var(--spira-muted)" />
                </button>
                <button type="button" onClick={() => quitar(d.key)} title={`Quitar ${d.name}`} aria-label={`Quitar ${d.name}`} style={iconBtn}>
                  <Icon name="trash" size={13} color="var(--spira-muted)" />
                </button>
              </div>
            )
          })}

          {editando === 'nuevo' ? (
            <div style={editBox}>
              <ReportForm
                known={known}
                accent={accent}
                accentSolid={accentSolid}
                onCancel={() => setEditando(null)}
                onSave={(r) => guardarReporte(r, 'nuevo')}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setEditando('nuevo')} style={agregarBtn}>
              <Icon name="plus" size={14} color={accent} /> Agregar reporte
            </button>
          )}
        </div>

        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

        {/* Footer ÚNICO para todo el modal */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--spira-line)', marginTop: 2 }}>
          <button type="button" style={{ ...btnOutline, marginTop: 12 }} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={busy || editando !== null}
            title={editando !== null ? 'Terminá de cargar el reporte abierto' : undefined}
            style={{
              ...btnPrimary(accentSolid), marginTop: 12,
              opacity: busy || editando !== null ? 0.55 : 1,
              cursor: busy || editando !== null ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const campo: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 }
/** Campo que la persona no puede editar: atenuado y sin cursor de texto, pero legible. */
const inerte: CSSProperties = { opacity: 0.6, cursor: 'default', background: 'var(--spira-surface)' }
const reporteRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
  border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)',
}
const editBox: CSSProperties = {
  border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-surface)', padding: '2px 12px 10px',
}
const badge: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, flex: '0 0 auto',
  height: 24, padding: '0 9px', borderRadius: 'var(--spira-radius-pill)',
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  fontSize: 12, color: 'var(--spira-ink)',
}
const iconBtn: CSSProperties = {
  width: 30, height: 30, flex: '0 0 auto', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 8, background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center',
}
/** Botón punteado de "agregar": invita sin competir con el primario del footer. */
const agregarBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 38,
  borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--spira-line-2)', borderRadius: 10,
  background: 'transparent', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const avisoBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}
