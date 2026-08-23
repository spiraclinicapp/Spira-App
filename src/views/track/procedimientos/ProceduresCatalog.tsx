import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { EmptyState } from '../../../components/EmptyState'
import { AutocompleteInput } from '../../../components/AutocompleteInput'
import type { Suggestion } from '../../../components/AutocompleteInput'
import { fieldInput } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { ProcedureEditModal } from './ProcedureEditModal'
import { agruparPorCategoria, categoriaColor, platformMeta } from './reportes'
import {
  useEstudioProcedimientos, addProtocolProcedure, removeProtocolProcedure,
} from '../../../data/protocolProcedures'
import type { EstudioProcedimiento } from '../../../data/protocolProcedures'
import { useProceduresCatalog, createProcedure } from '../../../data/procedures'

/**
 * "Procedimientos del estudio": el cuadro de este protocolo, con los reportes que lleva cada
 * procedimiento.
 *
 * Es la mitad de arriba de la decisión D3 de la review: la lista y el borrado son DE ESTE ESTUDIO
 * (el rótulo dice "del estudio" y muestra lo del estudio), pero el alta come del catálogo GLOBAL
 * con autocompletado — escribís tres letras y aparecen los procedimientos ya definidos en la
 * fundación; si no existe ninguno que sirva, se crea nuevo. "Un poco y un poco", como lo pidió el
 * Director.
 *
 * Lo que NO hace: asignar procedimientos a visitas. Eso sigue viviendo en Cronograma › Visitas
 * (`VisitProceduresModal`), que es donde se arma el cuadro visita por visita.
 */
export function ProceduresCatalog({ protocolId, accent, accentSolid, canEdit, canManageCatalog, header }: {
  protocolId: string
  accent: string
  accentSolid: string
  /** track-operator o gerencia: arma el cuadro del estudio y edita sus reportes. */
  canEdit: boolean
  /** track-leader o gerencia: además puede crear/renombrar en el catálogo GLOBAL. */
  canManageCatalog: boolean
  /** Las sub-solapas del cronograma, a la izquierda de la barra de acciones (ver `CronogramaTab`). */
  header?: ReactNode
}) {
  const estudio = useEstudioProcedimientos(protocolId)
  const catalogo = useProceduresCatalog()
  const [q, setQ] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<EstudioProcedimiento | null>(null)

  const rows = estudio.data ?? []
  /** Todos los reportes del estudio: el modal los usa para sugerir los ya cargados en OTROS procedimientos. */
  const todosLosReportes = useMemo(() => rows.flatMap((r) => r.reports), [rows])

  /* Sugerencias del alta: el catálogo GLOBAL menos lo que este estudio ya tiene (ofrecer algo que
     ya está solo lleva al error de duplicado). El `value` es el id del procedimiento; el texto
     libre que no matchea ninguna sugerencia se crea como procedimiento nuevo. */
  const yaEstan = new Set(rows.map((r) => r.procedure_id))
  const sugerencias: Suggestion[] = (catalogo.data ?? [])
    .filter((p) => !yaEstan.has(p.id))
    .map((p) => ({ value: p.id, label: p.name, hint: p.category ?? undefined }))

  const term = q.trim().toLowerCase()
  const visibles = term
    ? rows.filter((r) =>
        r.name.toLowerCase().includes(term) ||
        (r.code ?? '').toLowerCase().includes(term) ||
        (r.category ?? '').toLowerCase().includes(term))
    : rows
  const grupos = agruparPorCategoria(visibles)

  const agregar = async (procedureId: string | null) => {
    setBusy(true)
    setError(null)
    let id = procedureId
    // Sin id = el texto no matcheó ninguna sugerencia → alta en el catálogo global (si puede).
    if (!id) {
      const nombre = nuevo.trim()
      if (nombre === '') { setBusy(false); return }
      if (!canManageCatalog) {
        setBusy(false)
        setError('Ese procedimiento no está en el catálogo general, y crearlo lo hace gerencia o un líder de Coordinación.')
        return
      }
      const res = await createProcedure(nombre)
      if ('error' in res) { setBusy(false); setError(res.error); return }
      catalogo.refetch()
      id = res.value
    }
    const res = await addProtocolProcedure(protocolId, id)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setNuevo('')
    setAgregando(false)
    estudio.refetch()
  }

  const quitar = async (r: EstudioProcedimiento) => {
    setBusy(true)
    setError(null)
    const res = await removeProtocolProcedure(protocolId, r.procedure_id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    estudio.refetch()
  }

  /* Misma barra que la mitad de Visitas: las sub-solapas a la izquierda y la acción a la derecha,
     en un renglón. Se arma antes de los early returns para que las solapas no parpadeen mientras
     carga. El buscador baja a su propia fila: es un campo de ancho completo y meterlo acá dejaría
     las solapas apretadas contra él. */
  const barra = (header || canEdit) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 40 }}>
      {header}
      {canEdit && !agregando && (
        <button
          type="button"
          style={{ ...btnPrimary(accentSolid), marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}
          onClick={() => setAgregando(true)}
        >
          <Icon name="plus" size={15} color="var(--spira-on-accent)" /> Procedimiento
        </button>
      )}
    </div>
  )

  if (estudio.loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {barra}
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '8px 4px' }}>Cargando procedimientos…</div>
      </div>
    )
  }
  if (estudio.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {barra}
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', padding: '8px 4px' }}>No pudimos cargar los procedimientos del estudio.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {barra}

      {/* Buscador, en su propia fila */}
      <span style={{ position: 'relative', display: 'block' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'grid', pointerEvents: 'none' }}>
          <Icon name="search" size={15} color="var(--spira-muted)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, iniciales o categoría…"
          aria-label="Buscar procedimiento del estudio"
          style={{ ...fieldInput, paddingLeft: 36 }}
        />
      </span>

      {/* Fila de alta: autocompleta contra el catálogo global y deja cargar uno nuevo. */}
      {agregando && (
        <div style={altaBox}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <AutocompleteInput
                value={nuevo}
                onChange={setNuevo}
                onPick={(id) => void agregar(id)}
                suggestions={sugerencias}
                placeholder="Escribí para buscar en el catálogo general…"
                autoFocus
              />
            </span>
            <button type="button" style={{ ...btnOutline, flex: '0 0 auto' }} onClick={() => { setAgregando(false); setNuevo(''); setError(null) }}>
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...btnPrimary(accentSolid), flex: '0 0 auto', opacity: nuevo.trim() === '' || busy ? 0.55 : 1, cursor: nuevo.trim() === '' || busy ? 'default' : 'pointer' }}
              disabled={nuevo.trim() === '' || busy}
              onClick={() => {
                const match = sugerencias.find((s) => s.label.toLowerCase() === nuevo.trim().toLowerCase())
                void agregar(match ? match.value : null)
              }}
            >
              Agregar
            </button>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', lineHeight: 1.45 }}>
            Elegí uno del catálogo general o escribí un nombre nuevo.
            {!canManageCatalog && ' Crear uno nuevo lo hace gerencia o un líder de Coordinación.'}
          </span>
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon="clipboardCheck"
          title="Sin procedimientos"
          description="Agregá los procedimientos que hace este estudio para definirles los reportes que generan y sus plazos."
          minHeight={220}
        />
      ) : visibles.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 4px' }}>
          Ningún procedimiento coincide con «{q.trim()}».
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.categoria}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 2px 6px' }}>
              {categoriaColor(g.categoria) && (
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: categoriaColor(g.categoria) as string }} />
              )}
              <span className="spira-eyebrow">{g.categoria}</span>
              <span className="spira-mono" style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>{g.items.length}</span>
            </div>
            {g.items.map((r) => {
              /* Hasta 3 puntitos de plataforma junto a la píldora. Tres y no todos: son una pista de
                 "esto va a varios portales", no un inventario — para eso está el modal. */
              const plataformas = [...new Set(r.reports.map((x) => x.platform))].slice(0, 3)
              const bloqueado = r.visitas > 0
              return (
                <div key={r.id} className="spira-row-link spira-no-press" style={fila}>
                  <button
                    type="button"
                    onClick={() => setEditando(r)}
                    className="spira-no-press"
                    style={nombreBtn}
                    title={`Editar ${r.name}`}
                  >
                    <span style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>{r.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>
                      {r.min_estimated != null ? `~${r.min_estimated} min` : 'Sin duración cargada'}
                      {r.visitas > 0 && ` · en ${r.visitas} ${r.visitas === 1 ? 'visita' : 'visitas'}`}
                    </span>
                  </button>

                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                    {r.reports.length > 0 ? (
                      <span style={{ ...pill, borderColor: accent + '4D', color: accent }}>
                        {r.reports.length} {r.reports.length === 1 ? 'reporte' : 'reportes'}
                      </span>
                    ) : (
                      <span style={{ ...pill, color: 'var(--spira-muted)' }}>Sin reportes</span>
                    )}
                    {plataformas.map((p) => (
                      <span
                        key={p}
                        aria-hidden
                        title={platformMeta(p).label}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: platformMeta(p).color }}
                      />
                    ))}
                  </span>

                  <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)', flex: '0 0 auto', minWidth: 58, textAlign: 'right' }}>
                    {r.code ?? '—'}
                  </span>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { if (!bloqueado) void quitar(r) }}
                      disabled={bloqueado || busy}
                      /* Cuando está en visitas, el botón queda inerte CON su motivo en vez de
                         dejar que la persona lo apriete y choque contra el error de la RPC. El
                         guard real igual vive en la base (`remove_protocol_procedure`). */
                      title={bloqueado
                        ? `No se puede quitar: está en ${r.visitas} ${r.visitas === 1 ? 'visita' : 'visitas'} del cronograma`
                        : `Quitar ${r.name} del estudio`}
                      aria-label={`Quitar ${r.name} del estudio`}
                      style={{ ...iconBtn, opacity: bloqueado || busy ? 0.4 : 1, cursor: bloqueado || busy ? 'default' : 'pointer' }}
                    >
                      <Icon name="trash" size={13} color="var(--spira-muted)" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}

      {editando && (
        <ProcedureEditModal
          proc={editando}
          todosLosReportes={todosLosReportes}
          accent={accent}
          accentSolid={accentSolid}
          canEditCatalog={canManageCatalog}
          onClose={() => setEditando(null)}
          onSaved={() => estudio.refetch()}
        />
      )}
    </div>
  )
}

const fila: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
  borderTop: '1px solid var(--spira-line)',
}
const nombreBtn: CSSProperties = {
  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
  border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: 0,
  fontFamily: 'var(--spira-font-text)',
}
const pill: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 23, padding: '0 9px',
  borderRadius: 'var(--spira-radius-pill)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
}
const iconBtn: CSSProperties = {
  width: 30, height: 30, flex: '0 0 auto', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 8, background: 'var(--spira-white)', display: 'grid', placeItems: 'center',
}
const altaBox: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 13px',
  border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-surface)',
}
